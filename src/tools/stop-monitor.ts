import { WalletMonitor } from "../services/wallet-monitor.js";

export async function handleStopMonitor(monitor: WalletMonitor): Promise<string> {

  const status = monitor.getStatus();
  if (!status.running) {
    return "Monitor is not running.";
  }
  monitor.stop();
  return "Monitor stopped.";
}
