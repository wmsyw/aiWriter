import { redirect } from 'next/navigation';

export default async function PendingEntitiesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/novels/${id}/materials`);
}
