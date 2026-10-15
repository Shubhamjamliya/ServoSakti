import { Link } from 'react-router-dom';
import { AlertTriangle, Bot, CheckCircle2, Headset, Package, PackagePlus } from 'lucide-react';
import { Empty, Panel, RowLink, Screen, Section, StatTile, StatusPill } from '@/shared/components/Mobile';
import { useApi } from '@/shared/lib/useApi';
import { useAuth } from '@/shared/context/AuthContext';
import { fmtDate } from '@/shared/lib/format';

const ACTIONS = [
  ['/customer/product-passport', PackagePlus, 'Add product'],
  ['/customer/service-requests', Headset, 'Raise request'],
  ['/customer/complaints', Bot, 'AI complaint'],
];

export default function Home() {
  const { user } = useAuth();
  const { data: reqs } = useApi('/service-requests?limit=20');
  const { data: passports } = useApi('/products/passports?limit=50');
  const active = (reqs?.items || []).filter((r) => !['closed', 'cancelled'].includes(r.status)).slice(0, 4);
  const alerts = (passports?.items || []).filter((p) => ['Expiring Soon', 'Expired'].includes(p.warrantyStatus));

  return (
    <Screen title={`Hello, ${user?.name?.split(' ')[0] || 'there'}`} subtitle="Register products, raise service requests and track them here.">
      <div className="grid grid-cols-3 gap-2">
        {ACTIONS.map(([to, Icon, label]) => (
          <Link key={to} to={to} className="flex flex-col items-center gap-2 rounded-2xl border bg-white p-3 text-center text-xs font-semibold shadow-sm active:scale-95">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-secondary-foreground"><Icon className="h-5 w-5" /></span>{label}
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <StatTile label="Active requests" value={(reqs?.items || []).filter((r) => !['closed', 'cancelled', 'approved'].includes(r.status)).length} helper="In progress" icon={Headset} accent="bg-sky-100" to="/customer/tracking" />
        <StatTile label="Completed" value={(reqs?.items || []).filter((r) => ['closed', 'approved'].includes(r.status)).length} helper="Resolved" icon={CheckCircle2} accent="bg-green-100" to="/customer/history" />
        <StatTile label="My products" value={passports?.total ?? (passports?.items || []).length} helper="Registered" icon={Package} accent="bg-violet-100" to="/customer/product-passport" />
        <StatTile label="Warranty alerts" value={alerts.length} helper="Expiring / expired" icon={AlertTriangle} accent="bg-amber-100" to="/customer/product-passport" />
      </div>

      {alerts.length > 0 && (
        <Section title="Warranty alerts">
          {alerts.map((p) => (
            <Panel key={p._id} className="flex items-center gap-3 border-amber-200 bg-amber-50">
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
              <div className="text-sm"><p className="font-semibold">{p.brand} {p.model}</p><p className="text-amber-800">{p.warrantyStatus === 'Expired' ? 'Warranty expired' : 'Warranty expires'} on {fmtDate(p.warrantyEnd)}</p></div>
            </Panel>
          ))}
        </Section>
      )}

      <Section title="Active service requests">
        {active.length === 0 && <Empty>No active requests.</Empty>}
        {active.map((r) => (
          <RowLink key={r._id} to="/customer/tracking" title={`${r.srNumber} · ${[r.brand, r.model].filter(Boolean).join(' ')}`} meta={r.engineerName ? `Engineer: ${r.engineerName}` : 'Waiting for assignment'} right={<StatusPill status={r.status} />} />
        ))}
      </Section>

      <Section title="Your products">
        {(passports?.items || []).slice(0, 3).map((p) => (
          <Panel key={p._id} className="flex items-center justify-between text-sm"><span className="font-medium">{p.brand} {p.model}</span><StatusPill status={p.warrantyStatus} /></Panel>
        ))}
        {!passports?.items?.length && <Empty>Add a product to create its passport.</Empty>}
      </Section>
    </Screen>
  );
}
