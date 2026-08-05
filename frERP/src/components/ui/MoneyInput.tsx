import { useState } from "react";

/**
 * Formatea un número (o string numérico) con separadores de miles colombianos.
 * Ej: 1500000 → "1.500.000"
 */
export function formatThousands(value: string | number): string {
  const raw = String(value).replace(/\D/g, "");
  if (!raw) return "";
  return Number(raw).toLocaleString("es-CO");
}

/**
 * Extrae solo dígitos de una cadena formateada.
 * Ej: "1.500.000" → "1500000"
 */
export function stripFormatting(value: string): string {
  return value.replace(/\D/g, "");
}

type Props = {
  value: string;
  onChange: (rawValue: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  style?: React.CSSProperties;
  ariaLabel?: string;
};

/**
 * Input de dinero que muestra separadores de miles mientras el usuario escribe.
 * Internamente guarda solo dígitos ("1500000"), pero visualmente muestra "1.500.000".
 * Al perder el foco formatea; al ganar el foco mantiene el formato para facilitar la lectura.
 */
export function MoneyInput({
  value,
  onChange,
  placeholder = "$0",
  required,
  disabled,
  style,
  ariaLabel,
}: Props) {
  const [focused, setFocused] = useState(false);

  const displayed = focused ? formatThousands(value) : formatThousands(value);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = stripFormatting(e.target.value);
    onChange(raw);
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={displayed}
      onChange={handleChange}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      placeholder={placeholder}
      required={required}
      disabled={disabled}
      style={style}
      aria-label={ariaLabel}
    />
  );
}
