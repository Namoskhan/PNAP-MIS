import { EventTypeList } from '../../../../src/components/admin/EventTypesShared';
import { useLanguage } from '../../../../src/context/LanguageContext';

export default function MeetingTypesScreen() {
  const { t } = useLanguage();
  return <EventTypeList entity="MEETING" title={t('admin.meetingTypes', 'Meeting Types')} icon="📅" />;
}
