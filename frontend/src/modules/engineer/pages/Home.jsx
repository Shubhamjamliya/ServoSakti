import Card from '@/shared/components/Card.jsx';

export default function Home() {
  return (
    <div>
      <h2 className="text-lg font-semibold mb-3">Home</h2>
      <Card>Day status, today's assigned calls, approved-call count (target 5/month).</Card>
    </div>
  );
}
