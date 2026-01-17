import { ReactNode } from 'react';
import { motion } from 'motion/react';

interface TodoSectionProps {
  title: string;
  count: number;
  children: ReactNode;
}

export function TodoSection({ title, count, children }: TodoSectionProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-6"
    >
      <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
        {title} ({count})
      </h2>
      {children}
    </motion.div>
  );
}
