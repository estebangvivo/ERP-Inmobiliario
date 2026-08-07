"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type InputHTMLAttributes,
} from "react";
import { Calendar } from "lucide-react";
import {
  isoToDateAR,
  maskDateARInput,
  parseDateARToIso,
  toDateInputValue,
} from "@/lib/format-date";
import { cn } from "@/lib/utils";

type DateInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "defaultValue" | "onChange"
> & {
  /** Valor canónico AAAA-MM-DD. */
  value?: string;
  defaultValue?: string;
  onChange?: (isoDate: string) => void;
  className?: string;
  inputClassName?: string;
};

/**
 * Fecha visible siempre en DD/MM/AAAA.
 * El valor emitido / del input hidden (name) es AAAA-MM-DD.
 */
export function DateInput({
  value,
  defaultValue,
  onChange,
  name,
  required,
  disabled,
  className,
  inputClassName,
  id,
  ...rest
}: DateInputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const pickerRef = useRef<HTMLInputElement>(null);
  const controlled = value !== undefined;
  const [iso, setIso] = useState(() =>
    toDateInputValue(value ?? defaultValue ?? ""),
  );
  const [text, setText] = useState(() => isoToDateAR(iso));

  useEffect(() => {
    if (!controlled) return;
    const next = toDateInputValue(value ?? "");
    setIso(next);
    setText(isoToDateAR(next));
  }, [controlled, value]);

  function commitIso(nextIso: string) {
    setIso(nextIso);
    setText(isoToDateAR(nextIso));
    onChange?.(nextIso);
  }

  function handleTextChange(e: ChangeEvent<HTMLInputElement>) {
    const masked = maskDateARInput(e.target.value);
    setText(masked);
    if (masked.length === 10) {
      const parsed = parseDateARToIso(masked);
      if (parsed) commitIso(parsed);
    } else if (masked.length === 0) {
      commitIso("");
    }
  }

  function handleTextBlur() {
    if (!text.trim()) {
      commitIso("");
      return;
    }
    const parsed = parseDateARToIso(text);
    if (parsed) {
      commitIso(parsed);
      return;
    }
    setText(isoToDateAR(iso));
  }

  function handlePickerChange(e: ChangeEvent<HTMLInputElement>) {
    commitIso(e.target.value);
  }

  return (
    <div
      className={cn(
        "relative flex items-center rounded-md border border-border bg-background",
        disabled && "opacity-60",
        className,
      )}
    >
      {name ? <input type="hidden" name={name} value={iso} /> : null}
      <input
        {...rest}
        id={inputId}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="DD/MM/AAAA"
        disabled={disabled}
        required={required}
        value={text}
        onChange={handleTextChange}
        onBlur={handleTextBlur}
        className={cn(
          "w-full min-w-0 rounded-md bg-transparent px-3 py-2 text-sm outline-none ring-accent focus:ring-2",
          inputClassName,
        )}
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        aria-label="Abrir calendario"
        onClick={() => {
          const el = pickerRef.current;
          if (!el) return;
          try {
            el.showPicker?.();
          } catch {
            el.focus();
            el.click();
          }
        }}
        className="shrink-0 px-2 py-2 text-muted-foreground hover:text-foreground disabled:pointer-events-none"
      >
        <Calendar className="size-4" />
      </button>
      <input
        ref={pickerRef}
        type="date"
        tabIndex={-1}
        aria-hidden
        value={iso}
        onChange={handlePickerChange}
        className="sr-only"
      />
    </div>
  );
}
