import type { ReactNode } from "react";

import PageThemeColor from "./PageThemeColor";
import { FELT_GREEN_THEME_COLOR } from "../shared/themeColors";
import joinClasses from "./joinClasses";
import styles from "./Home.module.css";

export default function LoadingState({
  title,
  detail,
  children,
  isError = false,
  showSpinner = true,
}: {
  title: string;
  detail?: string;
  children?: ReactNode;
  isError?: boolean;
  showSpinner?: boolean;
}) {
  return (
    <>
      <PageThemeColor color={FELT_GREEN_THEME_COLOR} />
      <div className={styles.loadingState}>
        <div
          className={joinClasses(
            styles.loadingPanel,
            isError && styles.loadingPanelError
          )}
          role={isError ? "alert" : "status"}
          aria-live={isError ? "assertive" : "polite"}
        >
          {showSpinner && (
            <div className={styles.loadingSpinner} aria-hidden="true" />
          )}
          <div className={styles.loadingCopy}>
            <div className={styles.loadingStateText}>{title}</div>
            {detail && (
              <div className={styles.loadingStateDetail}>{detail}</div>
            )}
          </div>
          {children && <div className={styles.loadingActions}>{children}</div>}
        </div>
      </div>
    </>
  );
}
