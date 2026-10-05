import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '../context/LanguageContext';
import { Colors, FontSize, Radius, Spacing } from '../constants/colors';

export default function LanguageSelector({ variant = 'compact', style = {}, onLanguageChanged }) {
  const { currentLanguage, changeLanguage, supportedLanguages, isRTL, t } = useLanguage();

  const handleSelect = async (code) => {
    if (code === currentLanguage) return;
    await changeLanguage(code);
    if (onLanguageChanged) {
      onLanguageChanged(code);
    }
  };

  if (variant === 'card') {
    return (
      <View style={[styles.cardContainer, style]}>
        <View style={[styles.cardHeader, isRTL && styles.rtlRow]}>
          <Ionicons name="globe-outline" size={20} color={Colors.primary} />
          <Text style={[styles.cardTitle, isRTL ? styles.cardTitleRtl : styles.cardTitleLtr]}>
            {t('language.language', 'Language')} / ژبه / زبان
          </Text>
        </View>

        <View style={styles.optionsList}>
          {supportedLanguages.map((lang, index) => {
            const isSelected = currentLanguage === lang.code;
            const isLast = index === supportedLanguages.length - 1;

            return (
              <TouchableOpacity
                key={lang.code}
                activeOpacity={0.7}
                style={[
                  styles.optionRow,
                  isSelected && styles.optionRowSelected,
                  isLast && styles.optionRowLast,
                  isRTL && styles.rtlRow,
                ]}
                onPress={() => handleSelect(lang.code)}
              >
                <View style={[styles.optionInfo, isRTL && styles.optionInfoRtl]}>
                  <Text style={[styles.optionLabel, isSelected && styles.optionLabelSelected]}>
                    {lang.label}
                  </Text>
                  <Text style={styles.optionSub}>
                    {lang.code === 'en' ? 'English (LTR)' : lang.code === 'ur' ? 'اردو (دائیں سے بائیں)' : 'پښتو (له ښي څخه کیڼ)'}
                  </Text>
                </View>

                <View style={[styles.radioCircle, isSelected && styles.radioCircleSelected]}>
                  {isSelected && <Ionicons name="checkmark" size={14} color="#fff" />}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  }

  // Compact / pill variant
  return (
    <View style={[styles.compactContainer, isRTL && styles.rtlRow, style]}>
      <View style={styles.iconWrap}>
        <Ionicons name="globe-outline" size={16} color={Colors.textMuted} />
      </View>
      <View style={[styles.pillsWrap, isRTL && styles.rtlRow]}>
        {supportedLanguages.map((lang) => {
          const isSelected = currentLanguage === lang.code;
          return (
            <TouchableOpacity
              key={lang.code}
              activeOpacity={0.7}
              style={[styles.pill, isSelected && styles.pillActive]}
              onPress={() => handleSelect(lang.code)}
            >
              <Text style={[styles.pillText, isSelected && styles.pillTextActive]}>
                {lang.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rtlRow: {
    flexDirection: 'row-reverse',
  },
  // Compact styles
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: Radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: Colors.border,
    alignSelf: 'center',
  },
  iconWrap: {
    marginHorizontal: 4,
  },
  pillsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
    backgroundColor: 'transparent',
  },
  pillActive: {
    backgroundColor: Colors.primary,
  },
  pillText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  pillTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },

  // Card styles
  cardContainer: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  cardTitle: {
    fontSize: FontSize.base,
    fontWeight: '700',
    color: Colors.text,
  },
  cardTitleLtr: {
    marginLeft: Spacing.sm,
  },
  cardTitleRtl: {
    marginRight: Spacing.sm,
  },
  optionsList: {
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.surfaceAlt,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  optionRowSelected: {
    backgroundColor: '#eff6ff',
  },
  optionRowLast: {
    borderBottomWidth: 0,
  },
  optionInfo: {
    flex: 1,
  },
  optionInfoRtl: {
    alignItems: 'flex-end',
  },
  optionLabel: {
    fontSize: FontSize.base,
    fontWeight: '600',
    color: Colors.text,
  },
  optionLabelSelected: {
    color: Colors.primary,
    fontWeight: '700',
  },
  optionSub: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
  radioCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.textLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Spacing.sm,
  },
  radioCircleSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
});
