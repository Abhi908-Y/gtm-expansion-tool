import Shell from '@/components/plan/Shell';

export const dynamic = 'force-dynamic';

export default async function Plan({ params }: { params: Promise<{ id: string }> }) {
  return <Shell id={(await params).id} />;
}
