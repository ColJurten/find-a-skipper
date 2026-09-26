'use client';

interface MultiSelectTagsProps {
  options: readonly string[];
  selected: string[];
  onToggle: (value: string) => void;
  labelFor?: (value: string) => string;
}

export default function MultiSelectTags({ options, selected, onToggle, labelFor = (value) => value }: MultiSelectTagsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const active = selected.includes(option);
        return (
          <button
            key={option}
            type="button"
            aria-pressed={active}
            onClick={() => onToggle(option)}
            className={`rounded-full border px-3.5 py-2 text-sm font-medium transition ${
              active ? 'border-marine bg-marine text-white' : 'border-gray-200 bg-white text-anthracite hover:border-marine/40'
            }`}
          >
            {labelFor(option)}
          </button>
        );
      })}
    </div>
  );
}
