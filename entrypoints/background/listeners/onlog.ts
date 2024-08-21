import { onMessage } from "@/commons/message";

export const registerOnLog = () => {
  onMessage("log", ({ data }) => {
    // biome-ignore lint/suspicious/noConsoleLog: <explanation>
    console.log(`log: ${data.text}`);
  });
};
