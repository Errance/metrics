import type { Window } from '../lib/types';
import { WINDOW_OPTIONS } from '../lib/window';

type Props = {
  value: Window;
  onChange: (w: Window) => void;
};

export function WindowSelector({ value, onChange }: Props) {
  return (
    <div className="btn-group" role="group" aria-label="Time window">
      {WINDOW_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={opt.value === value ? 'active' : ''}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
