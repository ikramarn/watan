import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getTheme } from '../../../src/lib/theme';
import { api, getToken, getWsBaseUrl } from '../../../src/lib/api';
import { useAuth } from '../../../src/lib/auth';

export default function DriverChat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const theme = getTheme('driver');
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

  const send = async (msgText?: string) => {
    const t = (msgText ?? text).trim();
    if (!t) return;
    setText('');
    const newMsg = {
      id: `msg-${Date.now()}`,
      sender_id: user?.id || 'driver-me',
      text: t,
      created_at: new Date().toISOString(),
    };
    setMsgs((prev) => [...prev, newMsg]);

    try {
      await api(`/rides/${id}/messages`, { body: { text: t } });
    } catch (e) {
      // Local fallback retained
    }
  };

  const quickReplies = [
    'میں لوکیشن پر پہنچ گیا ہوں',
    'اسلام علیکم، باہر انتظار کر رہا ہوں',
    'تھوڑا ٹریفک ہے، 3 منٹ لگیں گے',
    'اوکے، ٹھیک ہے!',
  ];

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.bg }]} edges={['top', 'bottom']} testID="chat-screen">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <TouchableOpacity onPress={() => router.back()} testID="chat-back-btn">
            <Ionicons name="chevron-back" size={26} color={theme.text} />
          </TouchableOpacity>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ color: theme.text, fontSize: 16, fontWeight: '700' }}>Passenger Chat (مسافر رابطہ)</Text>
            <Text style={{ color: theme.accent, fontSize: 11, fontWeight: '600' }}>Active Ride Session</Text>
          </View>
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
            const mine = item.sender_id === user?.id || item.sender_id === 'driver-me';
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
            <View style={{ alignItems: 'center', marginTop: 40, gap: 8 }}>
              <Ionicons name="chatbubbles-outline" size={40} color={theme.textDim} />
              <Text style={{ color: theme.textDim, textAlign: 'center' }}>
                Say hi to your passenger • مسافر کو پیغام بھیجیں
              </Text>
            </View>
          }
        />

        {/* Quick Pakistani Driver Replies */}
        <View style={{ paddingHorizontal: 12, paddingBottom: 6 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {quickReplies.map((reply) => (
              <TouchableOpacity
                key={reply}
                onPress={() => send(reply)}
                style={[styles.quickChip, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}
              >
                <Text style={[styles.quickChipText, { color: theme.text }]}>{reply}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <View style={[styles.inputRow, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
          <TextInput
            testID="chat-input"
            value={text}
            onChangeText={setText}
            placeholder="Type message in English or اردو..."
            placeholderTextColor={theme.textFaint}
            style={[styles.input, { backgroundColor: theme.surfaceAlt, color: theme.text }]}
          />
          <TouchableOpacity
            testID="chat-send-btn"
            onPress={() => send()}
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
  quickChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, borderWidth: 1 },
  quickChipText: { fontSize: 12, fontWeight: '600' },
  inputRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10, borderTopWidth: 1 },
  input: { flex: 1, height: 46, borderRadius: 23, paddingHorizontal: 16, fontSize: 14 },
  sendBtn: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
});
