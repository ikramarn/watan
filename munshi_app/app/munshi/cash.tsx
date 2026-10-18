import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { munshiTheme } from '../../src/lib/theme';

export default function CashScreen() {
  const theme = munshiTheme;

  const [cashInPocket, setCashInPocket] = useState<number>(42500);
  const [departuresCount] = useState<number>(38);
  const [ticketsCount] = useState<number>(342);
  const [standCommission] = useState<number>(19400);
  const [printerConnected, setPrinterConnected] = useState<boolean>(true);

  const handleTestPrint = () => {
    Alert.alert(
      '✓ Bluetooth Printer Test',
      'Test print command sent to portable 58mm POS thermal printer.\n\nPaper status: Normal (85% Battery)'
    );
  };

  const handlePrintHandover = () => {
    Alert.alert(
      'پرچی حساب کتاب (Shift Handover)',
      `Shift Handover Parchi printed:\n\n• Munshi: Malik Aslam Khan\n• Stand: Al-Makkah Pirwadhai (#ISB-001)\n• Total Cash: Rs. ${cashInPocket.toLocaleString()}\n• Departures: ${departuresCount} Vehicles\n• Tickets: ${ticketsCount} Passengers`,
      [{ text: 'OK' }]
    );
  };

  const handleCloseShift = () => {
    Alert.alert(
      'شفٹ مکمل اور کیش ہینڈ اوور',
      `کیا آپ موجودہ شفٹ بند کر کے کیش (Rs. ${cashInPocket.toLocaleString()}) نئے منشی کے حوالے کرنا چاہتے ہیں؟`,
      [
        { text: 'منسوخ', style: 'cancel' },
        {
          text: 'ہینڈ اوور کریں (Close Shift)',
          onPress: () => {
            setCashInPocket(0);
            Alert.alert('✓ شفٹ مکمل', 'حساب کلیئر کر دیا گیا ہے۔ نیا کیش بیلنس: Rs. 0');
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.bg }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View>
          <Text style={{ color: theme.text, fontSize: 16, fontWeight: '800' }}>
            حساب کتاب و منشی پروفائل (Cash & Shift)
          </Text>
          <Text style={{ color: theme.textDim, fontSize: 11, marginTop: 2 }}>
            شفٹ کیش سمری، بلوٹوتھ پرنٹر، اور منشی اختیارات
          </Text>
        </View>

        <View style={[styles.shiftPill, { backgroundColor: 'rgba(16, 185, 129, 0.15)', borderColor: theme.accent }]}>
          <Text style={{ color: theme.accent, fontSize: 10, fontWeight: '800' }}>ایوننگ شفٹ</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40 }}>
        {/* Main Cash Balance Card */}
        <View style={[styles.cashHero, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={{ color: theme.textDim, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }}>
            موجودہ شفٹ کیش ان ہینڈ (Cash in Hand)
          </Text>
          <Text style={{ color: theme.accent, fontSize: 34, fontWeight: '900', letterSpacing: -1, marginTop: 4 }}>
            Rs. {cashInPocket.toLocaleString()}
          </Text>
          <Text style={{ color: theme.textDim, fontSize: 11, marginTop: 2 }}>
            کاؤونٹر پر وصول شدہ مسافر کرایہ و پرچی فیس
          </Text>

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
            <TouchableOpacity
              style={[styles.handoverBtn, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}
              onPress={handlePrintHandover}
            >
              <Ionicons name="print-outline" size={16} color={theme.accent} />
              <Text style={{ color: theme.text, fontSize: 12, fontWeight: '800' }}>
                پرچی حساب پرنٹ کریں
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.closeShiftBtn, { backgroundColor: 'rgba(239, 68, 68, 0.15)', borderColor: theme.danger }]}
              onPress={handleCloseShift}
            >
              <Ionicons name="lock-closed-outline" size={16} color={theme.danger} />
              <Text style={{ color: theme.danger, fontSize: 12, fontWeight: '800' }}>
                شفٹ کلوز کریں
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Shift Metrics Grid */}
        <View style={styles.metricsGrid}>
          <View style={[styles.metricCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Ionicons name="bus" size={18} color={theme.accent} />
            <Text style={{ color: theme.textDim, fontSize: 11, marginTop: 6 }}>روانہ گاڑیاں</Text>
            <Text style={{ color: theme.text, fontSize: 18, fontWeight: '900', marginTop: 2 }}>
              {departuresCount}
            </Text>
          </View>

          <View style={[styles.metricCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Ionicons name="receipt" size={18} color={theme.gold} />
            <Text style={{ color: theme.textDim, fontSize: 11, marginTop: 6 }}>جاری شدہ پرچیاں</Text>
            <Text style={{ color: theme.text, fontSize: 18, fontWeight: '900', marginTop: 2 }}>
              {ticketsCount}
            </Text>
          </View>

          <View style={[styles.metricCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Ionicons name="cash" size={18} color={theme.accent} />
            <Text style={{ color: theme.textDim, fontSize: 11, marginTop: 6 }}>اڈہ کمیشن وصولی</Text>
            <Text style={{ color: theme.accent, fontSize: 18, fontWeight: '900', marginTop: 2 }}>
              Rs. {standCommission.toLocaleString()}
            </Text>
          </View>
        </View>

        {/* Portable Bluetooth Thermal Printer Section */}
        <Text style={{ color: theme.text, fontSize: 14, fontWeight: '800', marginTop: 20, marginBottom: 10 }}>
          پورٹیبل تھرمل پرنٹر (Bluetooth POS Slip Printer)
        </Text>
        <View style={[styles.printerCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={[styles.printerIcon, { backgroundColor: 'rgba(16, 185, 129, 0.15)', borderColor: theme.accent }]}>
                <Ionicons name="print" size={20} color={theme.accent} />
              </View>
              <View>
                <Text style={{ color: theme.text, fontSize: 13, fontWeight: '800' }}>
                  Sunmi 58mm Portable POS
                </Text>
                <Text style={{ color: printerConnected ? theme.accent : theme.danger, fontSize: 11, marginTop: 1 }}>
                  {printerConnected ? '🟢 بلوٹوتھ کنیکٹڈ (85% بیٹری)' : '🔴 ڈس کنیکٹڈ'}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.testPrintBtn, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}
              onPress={handleTestPrint}
            >
              <Text style={{ color: theme.accent, fontSize: 11, fontWeight: '800' }}>ٹیسٹ پرنٹ</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Munshi Operator Profile Card */}
        <Text style={{ color: theme.text, fontSize: 14, fontWeight: '800', marginTop: 20, marginBottom: 10 }}>
          منشی نگران تفصیلات (Operator Profile)
        </Text>
        <View style={[styles.profileCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={[styles.munshiAvatar, { backgroundColor: 'rgba(16, 185, 129, 0.2)', borderColor: theme.accent }]}>
              <Text style={{ color: theme.accent, fontSize: 18, fontWeight: '900' }}>MAK</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontSize: 15, fontWeight: '900' }}>
                Malik Muhammad Aslam Khan
              </Text>
              <Text style={{ color: theme.gold, fontSize: 12, fontWeight: '700', marginTop: 1 }}>
                چیف منشی و انچارج اڈہ • Stand Admin
              </Text>
              <Text style={{ color: theme.textDim, fontSize: 11, marginTop: 1 }}>
                Al-Makkah Wagon Stand, Pirwadhai (#ISB-001)
              </Text>
            </View>
          </View>

          <View style={[styles.credGrid, { borderTopColor: theme.border }]}>
            <View style={styles.credItem}>
              <Text style={styles.credLabel}>CNIC:</Text>
              <Text style={[styles.credVal, { color: theme.text }]}>37405-1928371-3</Text>
            </View>
            <View style={styles.credItem}>
              <Text style={styles.credLabel}>MOBILE / RAAST:</Text>
              <Text style={[styles.credVal, { color: theme.text }]}>0300-8512349</Text>
            </View>
            <View style={styles.credItem}>
              <Text style={styles.credLabel}>STAND PLAN:</Text>
              <Text style={[styles.credVal, { color: theme.accent }]}>0% Driver Cut Active</Text>
            </View>
            <View style={styles.credItem}>
              <Text style={styles.credLabel}>DUTY HOURS:</Text>
              <Text style={[styles.credVal, { color: theme.text }]}>04:00 PM – 12:00 AM</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  shiftPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  cashHero: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
  },
  handoverBtn: {
    flex: 1.2,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  closeShiftBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  metricCard: {
    flex: 1,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  printerCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  printerIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  testPrintBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  profileCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 14,
  },
  munshiAvatar: {
    width: 46,
    height: 46,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  credGrid: {
    borderTopWidth: 1,
    paddingTop: 12,
    gap: 6,
  },
  credItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  credLabel: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '700',
  },
  credVal: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: 'monospace',
  },
});
