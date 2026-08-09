"use client";

import { useEffect } from "react";

export function BrowserBranding() {
  useEffect(() => {
    document.title =
      "YOKAI OS — WRAP INTELLIGENCE";

    let description =
      document.querySelector<HTMLMetaElement>(
        'meta[name="description"]'
      );

    if (!description) {
      description =
        document.createElement(
          "meta"
        );

      description.name =
        "description";

      document.head.appendChild(
        description
      );
    }

    description.content =
      "Prywatny system operacyjny YOKAI WRAP";

    const oldIcons =
      document.querySelectorAll<
        HTMLLinkElement
      >(
        'link[rel="icon"], link[rel="shortcut icon"]'
      );

    oldIcons.forEach(
      (icon) => icon.remove()
    );

    const favicon =
      document.createElement(
        "link"
      );

    favicon.rel = "icon";
    favicon.type = "image/png";
    favicon.href =
      "/yokai-favicon.png?v=0374";

    document.head.appendChild(
      favicon
    );
  }, []);

  return null;
}
