interface Props {
  message: string;
}

export function ErrorDisplay({ message }: Props) {
  return (
    <div className="absolute inset-0 flex items-center justify-center z-30">
      <div className="bg-red-900/80 text-white px-6 py-4 rounded-lg max-w-md text-center">
        <p className="font-medium mb-1">Error</p>
        <p className="text-sm text-white/80">{message}</p>
      </div>
    </div>
  );
}
