export function LoadingSpinner() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-30 pointer-events-none">
      <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin" />
    </div>
  );
}
