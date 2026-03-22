interface Props {
  message: string;
}

export function ErrorDisplay({ message }: Props) {
  return (
    <div className="absolute inset-0 flex items-center justify-center z-30">
      <div className="text-center max-w-sm px-6">
        <p className="text-red-400/80 text-sm">{message}</p>
      </div>
    </div>
  );
}
