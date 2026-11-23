/**
 * Лист у края экрана (shadcn Sheet) или окно по центру (shadcn Dialog) поверх карты.
 */
import type { ReactNode } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';

export type EdgeSheetSide = 'left' | 'right' | 'top' | 'bottom' | 'center';

export type EdgeSheetProps = {
  readonly open: boolean;
  readonly title: string;
  readonly description?: string;
  readonly side?: EdgeSheetSide;
  readonly onClose: () => void;
  readonly children: ReactNode;
};

/**
 * Лист с заголовком и прокручиваемым телом; закрывается крестиком, фоном и Esc.
 *
 * @param props - открыт ли, заголовок, сторона и содержимое
 */
export function EdgeSheet(props: EdgeSheetProps) {
  const { open, title, description, side = 'center', onClose, children } = props;
  const onOpenChange = (next: boolean): void => {
    if (!next) {
      onClose();
    }
  };
  if (side === 'center') {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          <div className="flex flex-col gap-4">{children}</div>
        </DialogContent>
      </Dialog>
    );
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={side} className="w-full gap-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>{title}</SheetTitle>
          {description ? <SheetDescription>{description}</SheetDescription> : null}
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
