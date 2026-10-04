import { EventTypeList } from '../../../../src/components/admin/EventTypesShared';
import { useLanguage } from '../../../../src/context/LanguageContext';

export default function ActivityTypesScreen() {
  const { t } = useLanguage();
  return <EventTypeList entity="ACTIVITY" title={t('admin.activityTypes', 'Activity Types')} icon="🚩" />;
}
