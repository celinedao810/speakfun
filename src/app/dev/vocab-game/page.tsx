import { notFound } from 'next/navigation';
import VocabGamePlayground from './VocabGamePlayground';

/**
 * Dev-only playground for the falling-words vocab game. Renders Exercise1Vocab with
 * sample words and shows the result instead of saving it, so the game can be tried
 * locally without waiting for a homework window. Nothing here touches the database.
 */
export default function VocabGameDevPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <VocabGamePlayground />;
}
