export default function joinClasses(...args: (string | false)[]) {
  return args.filter(Boolean).join(" ");
}
