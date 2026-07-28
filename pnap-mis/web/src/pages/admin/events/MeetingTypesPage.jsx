import EventTypeListPage from './EventTypeListPage';
import { ClipboardIcon } from '../../../components/icons';

export default function MeetingTypesPage() {
  return (
    <EventTypeListPage
      entity="MEETING"
      title="Meeting Types"
      subtitle="The catalogue of meeting types every unit can record."
      icon={<ClipboardIcon size={22} />}
    />
  );
}
