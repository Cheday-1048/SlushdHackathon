import { Store } from 'lucide-react';
import { brand } from '@/design-system/brand';

export function BrandMark({ showName = true }: { showName?: boolean }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-soft"><Store className="size-[18px]" aria-hidden /></span>
      {showName && <span className="truncate font-display text-sm font-semibold">{brand.name}</span>}
    </span>
  );
}
