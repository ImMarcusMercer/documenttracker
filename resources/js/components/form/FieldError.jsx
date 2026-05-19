export default function FieldError({ id, message }) {
  if (!message) return null;

  return (
    <p id={id} role="alert" aria-live="polite" className="text-sm font-medium text-destructive">
      {message}
    </p>
  );
}
