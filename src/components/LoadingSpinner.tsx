export function LoadingSpinner() {
  return (
    <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none">
      <div className="w-6 h-6 border-2 border-white/10 border-t-white/50 rounded-full animate-spin" />
    </div>
  );
}
