import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { Colors, FontSize, Radius, Spacing } from '../constants/colors';

const QUICK_WORDS = [
  'فعاله',
  'غير فعاله',
  'حاضر',
  'غير حاضر',
  'رخصت',
  'غونډه',
  'جلسه',
  'مظاهره',
  'سيمينار',
  'سټډي سرکل',
  'چنده',
  'دوره',
  'مطالعه',
  'پريس کانفرنس',
  'شموليت',
  'مرستيال',
  'سکرټري',
  'صوبائي',
  'ضلعي',
  'علاقائي',
  'ابتدائي يونټ',
  'پښتونخوا',
  'ملګري',
];

const PASHTO_SPECIAL_LETTERS = ['ښ', 'ځ', 'څ', 'ډ', 'ړ', 'ږ', 'ڼ', 'ۍ', 'ې', 'ئ', 'ټ', 'ګ', 'آ', 'ء'];

const PASHTO_ALPHABET_ROWS = [
  ['آ', 'ا', 'ب', 'پ', 'ت', 'ټ', 'ث', 'ج', 'چ', 'ح', 'خ', 'ځ', 'څ'],
  ['د', 'ډ', 'ذ', 'ر', 'ړ', 'ز', 'ژ', 'ږ', 'س', 'ش', 'ښ', 'ص', 'ض'],
  ['ط', 'ظ', 'ع', 'غ', 'ف', 'ق', 'ک', 'ګ', 'ل', 'م', 'ن', 'ڼ'],
  ['و', 'ه', 'ی', 'ي', 'ې', 'ۍ', 'ئ', '،', '؟', '۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'],
];

export default function MobilePashtoKeyboardHelper({ onInsert, onBackspace }) {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState('words'); // 'words' | 'letters' | 'full'

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.titleBox}>
          <Text style={styles.icon}>⌨️</Text>
          <Text style={styles.title}>د پښتو ليکلو مرستيال (Pashto Keyboard)</Text>
        </View>
        <TouchableOpacity
          style={styles.toggleBtn}
          onPress={() => setExpanded(!expanded)}
        >
          <Text style={styles.toggleBtnText}>{expanded ? '▲ پټول' : '▼ پرانيستل'}</Text>
        </TouchableOpacity>
      </View>

      {expanded && (
        <View style={styles.content}>
          {/* Tab selector */}
          <View style={styles.tabBar}>
            <TouchableOpacity
              style={[styles.tabItem, activeTab === 'words' && styles.tabItemActive]}
              onPress={() => setActiveTab('words')}
            >
              <Text style={[styles.tabText, activeTab === 'words' && styles.tabTextActive]}>عام الفاظ (Words)</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabItem, activeTab === 'letters' && styles.tabItemActive]}
              onPress={() => setActiveTab('letters')}
            >
              <Text style={[styles.tabText, activeTab === 'letters' && styles.tabTextActive]}>پښتو توري (Letters)</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabItem, activeTab === 'full' && styles.tabItemActive]}
              onPress={() => setActiveTab('full')}
            >
              <Text style={[styles.tabText, activeTab === 'full' && styles.tabTextActive]}>مکمل کي بورډ</Text>
            </TouchableOpacity>
          </View>

          {/* Quick Words */}
          {activeTab === 'words' && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.wordsScroll}>
              {QUICK_WORDS.map((w) => (
                <TouchableOpacity
                  key={w}
                  style={styles.wordChip}
                  onPress={() => onInsert && onInsert(` ${w} `)}
                >
                  <Text style={styles.wordChipText}>{w}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {/* Special Letters */}
          {activeTab === 'letters' && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.wordsScroll}>
              {PASHTO_SPECIAL_LETTERS.map((char) => (
                <TouchableOpacity
                  key={char}
                  style={styles.letterBtn}
                  onPress={() => onInsert && onInsert(char)}
                >
                  <Text style={styles.letterBtnText}>{char}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {/* Full Keypad */}
          {activeTab === 'full' && (
            <View style={styles.fullPad}>
              {PASHTO_ALPHABET_ROWS.map((row, rIdx) => (
                <ScrollView key={rIdx} horizontal showsHorizontalScrollIndicator={false} style={styles.rowScroll}>
                  {row.map((char) => (
                    <TouchableOpacity
                      key={char}
                      style={styles.keyBtn}
                      onPress={() => onInsert && onInsert(char)}
                    >
                      <Text style={styles.keyBtnText}>{char}</Text>
                    </TouchableOpacity>
                  ))}
                  {rIdx === PASHTO_ALPHABET_ROWS.length - 1 && (
                    <>
                      <TouchableOpacity
                        style={[styles.keyBtn, styles.spaceBtn]}
                        onPress={() => onInsert && onInsert(' ')}
                      >
                        <Text style={styles.keyBtnText}>فاصله</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.keyBtn, styles.backspaceBtn]}
                        onPress={() => onBackspace && onBackspace()}
                      >
                        <Text style={[styles.keyBtnText, { color: '#fff' }]}>⌫</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </ScrollView>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0f172a',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#334155',
    marginVertical: Spacing.sm,
    padding: Spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  titleBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  icon: {
    fontSize: 16,
  },
  title: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: '#e2e8f0',
  },
  toggleBtn: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: '#475569',
  },
  toggleBtnText: {
    fontSize: FontSize.xs,
    color: '#38bdf8',
    fontWeight: '600',
  },
  content: {
    marginTop: Spacing.sm,
  },
  tabBar: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: Spacing.sm,
  },
  tabItem: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: Radius.sm,
    backgroundColor: '#1e293b',
  },
  tabItemActive: {
    backgroundColor: '#0284c7',
  },
  tabText: {
    fontSize: FontSize.xs,
    color: '#94a3b8',
  },
  tabTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  wordsScroll: {
    gap: 6,
    paddingVertical: 4,
  },
  wordChip: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: '#475569',
  },
  wordChipText: {
    color: '#f8fafc',
    fontSize: FontSize.sm,
  },
  letterBtn: {
    backgroundColor: '#1e293b',
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: '#0284c7',
  },
  letterBtnText: {
    color: '#38bdf8',
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  fullPad: {
    gap: 4,
  },
  rowScroll: {
    flexDirection: 'row',
  },
  keyBtn: {
    backgroundColor: '#1e293b',
    minWidth: 32,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#334155',
    marginRight: 4,
    paddingHorizontal: 4,
  },
  spaceBtn: {
    minWidth: 50,
    backgroundColor: '#334155',
  },
  backspaceBtn: {
    minWidth: 40,
    backgroundColor: '#dc2626',
    borderColor: '#dc2626',
  },
  keyBtnText: {
    color: '#f8fafc',
    fontSize: FontSize.sm,
  },
});
