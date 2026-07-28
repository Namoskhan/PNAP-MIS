import EventTypeListPage from './EventTypeListPage';
import { TargetIcon } from '../../../components/icons';

export default function ActivityTypesPage() {
  return (
    <EventTypeListPage
      entity="ACTIVITY"
      title="Activity Types"
      subtitle="The catalogue of activity types every unit can record."
      icon={<TargetIcon size={22} />}
    />
  );
}
