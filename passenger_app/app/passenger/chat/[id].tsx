import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getTheme } from '../../../src/lib/theme';
import { api, getToken, getWsBaseUrl } from '../../../src/lib/api';
import { useAuth } from '../../../src/lib/auth';

export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user, role } = useAuth();
  const theme = getTheme(role);
  const [msgs, setMsgs] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [connState, setConnState] = useState<'connecting' | 'connected' | 'offline'>('connecting');
  const listRef = useRef<FlatList>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await api<any[]>(`/rides/${id}/messages`);
      setMsgs(data);
    } catch (e) {
      console.warn('chat refresh failed', e);
      setConnState((s) => (s === 'connected' ? s : 'offline'));
    }
  }, [id]);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let cancelled = false;

    const connect = async () => {
      refresh();
      try {
        const token = await getToken();
        const wsBase = await getWsBaseUrl();
        if (!token || !id) throw new Error('Missing token or ride id');
        ws = new WebSocket(`${wsBase}/ws/rides/${id}?token=${encodeURIComponent(token)}`);

        ws.onopen = () => {
          if (!cancelled) setConnState('connected');
        };
        ws.onmessage = (event) => {
          const payload = JSON.parse(event.data);
          if (payload.event === 'chat.message' && payload.message) {
            setMsgs((prev) => [...prev, payload.message]);
            return;
          }
          if (payload.event?.startsWith?.('ride.')) {
            refresh();
          }
        };
        ws.onerror = () => {
          if (!cancelled) setConnState('offline');
        };
        ws.onclose = () => {
          if (!cancelled) setConnState('offline');
        };
      } catch (e) {
        console.warn('chat ws connect failed', e);
        if (!cancelled) setConnState('offline');
      }
    };

    connect();
    return () => {
      cancelled = true;
      ws?.close();
    };
  }, [refresh]);

  const send = async () => {
    const t = text.trim();
    if (!t) return;
    setText('');
    try {
      await api(`/rides/${id}/messages`, { body: { text: t } });
    } catch (e) {
      console.warn('chat send failed', e);
      setConnState('offline');
      refresh();
    }
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.bg }]} edges={['top', 'bottom']} testID="chat-screen">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <TouchableOpacity onPress={() => router.back()} testID="chat-back-btn">
            <Ionicons name="chevron-back" size={26} color={theme.text} />
          </TouchableOpacity>
          <Text style={{ color: theme.text, fontSize: 17, fontWeight: '700' }}>In-ride chat</Text>
          <Text style={{ color: connState === 'connected' ? theme.success : theme.textDim, fontSize: 11 }}>
            {connState}
          </Text>
        </View>

        <FlatList
          ref={listRef}
          data={msgs}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 16, gap: 8 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => {
            const mine = item.sender_id === user?.id;
            return (
              <View
                style={{
                  alignSelf: mine ? 'flex-end' : 'flex-start',
                  backgroundColor: mine ? theme.ctaBg : theme.surfaceAlt,
                  paddingHorizontal: 14, paddingVertical: 10,
                  borderRadius: 18, maxWidth: '78%',
                }}
              >
                <Text style={{ color: mine ? theme.ctaText : theme.text, fontSize: 14 }}>{item.text}</Text>
              </View>
            );
          }}
          ListEmptyComponent={
            <Text style={{ color: theme.textDim, textAlign: 'center', marginTop: 40 }}>
              Say hi to your {role === 'passenger' ? 'driver' : 'passenger'} 👋
            </Text>
          }
        />

        <View style={[styles.inputRow, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
          <TextInput
            testID="chat-input"
            value={text}
            onChangeText={setText}
            placeholder="Message…"
            placeholderTextColor={theme.textFaint}
            style={[styles.input, { backgroundColor: theme.surfaceAlt, color: theme.text }]}
          />
          <TouchableOpacity
            testID="chat-send-btn"
            onPress={send}
            style={[styles.sendBtn, { backgroundColor: theme.ctaBg }]}
          >
            <Ionicons name="send" size={18} color={theme.ctaText} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, borderBottomWidth: 1 },
  inputRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10, borderTopWidth: 1 },
  input: { flex: 1, height: 46, borderRadius: 23, paddingHorizontal: 16, fontSize: 15 },
  sendBtn: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
});
