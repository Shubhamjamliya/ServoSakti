export default function Card({ title, children }) {
  return (
    <div className="rounded-xl border p-4 mb-3 bg-white">
      {title && <h3 className="font-medium mb-1">{title}</h3>}
      <div className="text-sm text-slate-600">{children}</div>
    </div>
  );
}
