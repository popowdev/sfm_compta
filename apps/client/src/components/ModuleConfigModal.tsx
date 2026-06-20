import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { MODULE_CONFIG, moduleConfigBool } from '@rp-compta/shared';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { setModuleConfig, type MyModule } from '@/lib/me';

export function ModuleConfigModal({
  companyId,
  module,
  onClose,
}: {
  companyId: number;
  module: MyModule | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const fields = module ? (MODULE_CONFIG[module.key] ?? []) : [];
  const [values, setValues] = useState<Record<string, boolean>>({});
  const seeded = useRef(false);

  useEffect(() => {
    if (!module) {
      seeded.current = false;
      return;
    }
    if (!seeded.current) {
      seeded.current = true;
      const v: Record<string, boolean> = {};
      for (const f of MODULE_CONFIG[module.key] ?? []) {
        v[f.key] = moduleConfigBool(module.config, module.key, f.key);
      }
      setValues(v);
    }
  }, [module]);

  const save = useMutation({
    mutationFn: () => setModuleConfig(companyId, module!.key, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-companies'] });
      onClose();
    },
  });

  if (!module || fields.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-sm font-semibold">Options · {module.label}</h2>
          <button
            type="button"
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-1 p-3">
          {fields.map((f) => (
            <div key={f.key} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2.5">
              <div className="min-w-0">
                <div className="text-sm font-medium">{f.label}</div>
                {f.help && <div className="text-xs text-muted-foreground">{f.help}</div>}
              </div>
              <Switch
                checked={values[f.key] ?? f.default}
                onChange={() => setValues((s) => ({ ...s, [f.key]: !(s[f.key] ?? f.default) }))}
              />
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 border-t px-5 py-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button type="button" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </div>
      </div>
    </div>
  );
}
