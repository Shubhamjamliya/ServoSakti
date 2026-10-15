export default function PagePlaceholder({ title, children }) {
  return (
    <div>
      <h2 className="text-xl font-semibold mb-2">{title}</h2>
      <p className="text-sm text-slate-500">{children || 'Coming soon.'}</p>
    </div>
  );
}
