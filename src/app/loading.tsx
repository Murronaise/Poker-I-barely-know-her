export default function Loading() {
  return (
    <div className="flex-1 min-h-0 flex flex-col items-center justify-center px-6 py-10">
      <div className="relative w-20 h-20 mb-6">
        <div className="absolute inset-0 rounded-full border-4 border-white/5"></div>
        <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-[#39FF14] animate-spin"></div>
        <div className="absolute inset-2 rounded-full bg-[#39FF14]/10 animate-pulse-glow"></div>
      </div>
      <p className="text-[#39FF14] font-black tracking-[0.3em] uppercase text-sm animate-pulse">
        Shuffling the deck
      </p>
    </div>
  );
}
