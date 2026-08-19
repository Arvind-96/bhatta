import { forwardRef, InputHTMLAttributes } from "react";

export type DateInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

// Native <input type="date"> only opens its calendar when the tiny icon is
// clicked in some browsers — clicking or tabbing into the rest of the field
// just places a text cursor, so admins end up typing dates by hand. This
// wraps it so clicking or focusing anywhere on the field opens the calendar
// picker directly, everywhere in the app a date is entered.
export const DateInput = forwardRef<HTMLInputElement, DateInputProps>(function DateInput(
  { onClick, onFocus, ...props },
  ref
) {
  function openPicker(el: HTMLInputElement) {
    if (typeof el.showPicker === "function") {
      try {
        el.showPicker();
      } catch {
        // Browsers without support, or that refuse outside a direct user gesture, no-op here.
      }
    }
  }

  return (
    <input
      {...props}
      ref={ref}
      type="date"
      onClick={(e) => {
        openPicker(e.currentTarget);
        onClick?.(e);
      }}
      onFocus={(e) => {
        openPicker(e.currentTarget);
        onFocus?.(e);
      }}
    />
  );
});
