import { ExternalLink } from 'lucide-react';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import ResourcePage from '@/shared/components/ResourcePage';
import EngineersMap from '@/shared/components/EngineersMap';
import { useApi } from '@/shared/lib/useApi';
import { viewUrl } from '@/shared/lib/googleMaps';
import { fmtDateTime } from '@/shared/lib/format';
import { inr } from '@/shared/lib/utils';

const TONE = { Started: 'green', 'Not started': 'amber', Closed: 'gray' };

export default function Tracking() {
  const { data } = useApi('/engineers?status=approved&limit=200');
  const { data: zones } = useApi('/zones/public');
  return (
    <ResourcePage
      header={<EngineersMap engineers={data?.items || []} zones={zones?.items || []} />}
      eyebrow="Calls"
      title="Tracking"
      endpoint="/engineers"
      params={{ status: 'approved' }}
      columns={[
        { key: 'name', label: 'Engineer' },
        { key: 'phone', label: 'Phone' },
        { key: 'dayStatus', label: 'Day status', render: (r) => <Badge tone={TONE[r.dayStatus]}>{r.dayStatus}</Badge> },
        { key: 'dayStartedAt', label: 'Day started', render: (r) => fmtDateTime(r.dayStartedAt), csv: (r) => fmtDateTime(r.dayStartedAt) },
        { key: 'openCalls', label: 'Open calls' },
        { key: 'cashHeld', label: 'Cash held', render: (r) => (r.cashHeld ? <span className="font-semibold text-amber-700">{inr(r.cashHeld)}</span> : '—'), csv: (r) => r.cashHeld || 0 },
        { key: 'available', label: 'Availability', render: (r) => <Badge tone={r.available ? 'green' : 'gray'}>{r.available ? 'Available' : 'Off duty'}</Badge> },
        { key: 'location', label: 'Last location', render: (r) => (r.location?.lat ? <span>{fmtDateTime(r.location.at)}</span> : '—'), csv: (r) => (r.location?.lat ? `${r.location.lat},${r.location.lng}` : '') },
      ]}
      rowActions={({ row }) =>
        row.location?.lat && (
          <Button size="sm" variant="outline" asChild>
            <a href={viewUrl(row.location.lat, row.location.lng)} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" /> Map</a>
          </Button>
        )
      }
    />
  );
}
