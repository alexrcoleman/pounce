export default function joinClasses(
  ...args: (string | false | null | undefined)[]
) {
  return args.filter(Boolean).join(" ");
}
