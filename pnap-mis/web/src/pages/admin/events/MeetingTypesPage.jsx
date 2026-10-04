import { useTranslation } from 'react-i18next';
import EventTypeListPage from './EventTypeListPage';
import { ClipboardIcon } from '../../../components/icons';

export default function MeetingTypesPage() {
  const { t } = useTranslation();
  return (
    <EventTypeListPage
      entity="MEETING"
      title={t('admin.meetingTypes', 'Meeting Types')}
      subtitle={t('admin.meetingTypesSubtitle', 'The catalogue of meeting types every unit can record.')}
      icon={<ClipboardIcon size={22} />}
    />
  );
}
