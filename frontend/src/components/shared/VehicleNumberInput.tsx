import { type InputHTMLAttributes } from "react";
import { formatVehicleNumber } from "@/lib/utils";

// Enforced everywhere a vehicle number is entered: auto-uppercases and
// auto-inserts dashes as the admin types (see formatVehicleNumber), and
// carries a native `pattern` so a value that's still incomplete on submit
// gets the app-wide red `:user-invalid` outline (see index.css) instead of
// silently saving something that doesn't match XX-XX-XX-XXXX.
export const VEHICLE_NUMBER_PATTERN = "[A-Z0-9]{2}-[A-Z0-9]{2}-[A-Z0-9]{2}-[A-Z0-9]{4}";

type VehicleNumberInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type" | "pattern"> & {
  value: string;
  onChange: (value: string) => void;
};

export function VehicleNumberInput({ value, onChange, title, ...rest }: VehicleNumberInputProps) {
  return (
    <input
      {...rest}
      type="text"
      value={value}
      onChange={(e) => onChange(formatVehicleNumber(e.target.value))}
      pattern={VEHICLE_NUMBER_PATTERN}
      title={title ?? "Format: XX-XX-XX-XXXX"}
    />
  );
}
