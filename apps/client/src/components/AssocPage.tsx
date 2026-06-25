import { type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAssociation } from '@/lib/useAssociation';
import type { AssociationDetail } from '@/lib/associations';

export function AssocPage({
  title,
  children,
}: {
  title: string;
  children: (detail: AssociationDetail) => ReactNode;
}) {
  const { detail, isLoading, isError } = useAssociation();
  if (isLoading) return <div className="p-8 text-sm text-muted-foreground">Chargement…</div>;
  if (isError || !detail) return <Navigate to="/associations" replace />;
  return (
    <div className="p-8">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {detail.association.name}
      </div>
      <h1 className="mt-1 text-2xl font-bold tracking-tight">{title}</h1>
      <div className="mt-6">{children(detail)}</div>
    </div>
  );
}
