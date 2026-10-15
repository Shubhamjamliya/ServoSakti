import { cn } from '@/shared/lib/utils';

export default function Tabs({ tabs, value, onChange }) {
  return (
    <div className="inline-flex rounded-xl bg-neutral-100 p-1">
      {tabs.map((t) => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={cn('rounded-lg px-4 py-1.5 text-sm font-medium transition', value === t.value ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-800')}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
