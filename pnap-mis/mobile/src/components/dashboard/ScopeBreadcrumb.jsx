import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors, FontSize, Radius, Spacing } from '../../constants/colors';

const LEVEL_LABEL = {
  NATIONAL: 'National',
  PROVINCE: 'Province',
  DISTRICT: 'District',
  AREA: 'Area',
  BASIC_UNIT: 'Basic Unit',
};

export default function ScopeBreadcrumb({ trail, onNavigate }) {
  const crumbs = trail && trail.length
    ? trail
    : [{ level: 'NATIONAL', _id: null, name: 'Pakistan' }];

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {crumbs.map((c, i) => {
          const isCurrent = i === crumbs.length - 1;
          return (
            <View key={`${c.level}-${c._id || i}`} style={styles.crumbWrapper}>
              {i > 0 && <Text style={styles.sep}>›</Text>}
              <TouchableOpacity
                disabled={isCurrent}
                onPress={() => onNavigate(c.level, c._id)}
                style={[styles.crumbBtn, isCurrent && styles.crumbCurrent]}
              >
                <Text style={[styles.crumbText, isCurrent && styles.crumbTextCurrent]}>
                  {c.name || LEVEL_LABEL[c.level] || c.level}
                </Text>
                {isCurrent && c.level !== 'NATIONAL' && (
                  <Text style={styles.badgeLabel}>
                    {LEVEL_LABEL[c.level] || c.level}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 6,
    paddingHorizontal: Spacing.sm,
    backgroundColor: '#0f172a',
    borderRadius: Radius.md,
    marginBottom: Spacing.sm,
  },
  scrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  crumbWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sep: {
    color: '#64748b',
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  crumbBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: Radius.sm,
  },
  crumbCurrent: {
    backgroundColor: '#1e293b',
  },
  crumbText: {
    color: '#38bdf8',
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  crumbTextCurrent: {
    color: '#f8fafc',
    fontWeight: '700',
  },
  badgeLabel: {
    color: '#94a3b8',
    fontSize: 9,
    fontWeight: '600',
    backgroundColor: '#334155',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
});
