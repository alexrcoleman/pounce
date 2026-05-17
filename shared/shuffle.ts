import rand from "rand-seed";

const randomSeed = `${Date.now()}-${Math.random()}`;
const random = new rand(randomSeed);

export default function shuffle<T>(array: T[]): T[] {
  let currentIndex = array.length;

  while (currentIndex != 0) {
    const randomIndex = Math.floor(random.next() * currentIndex);
    currentIndex--;

    [array[currentIndex], array[randomIndex]] = [
      array[randomIndex],
      array[currentIndex],
    ];
  }

  return array;
}
