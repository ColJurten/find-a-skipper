'use client';

import MultiSelectTags from '@/components/multi-select-tags';
import { CERTIFICATION_GROUPS } from '@/lib/profile-options';

export default function CertificationSelect({ selected, onToggle }: { selected: string[]; onToggle: (value: string) => void }) {
  return (
    <div className="space-y-4">
      {CERTIFICATION_GROUPS.map((group) => (
        <div key={group.label}>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{group.label}</div>
          <MultiSelectTags options={group.options} selected={selected} onToggle={onToggle} />
        </div>
      ))}
    </div>
  );
}
