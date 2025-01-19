import { getLocaleID, getString } from "../utils/locale";
import { getPref } from "../utils/prefs";
interface TranslationResponse {
  status: string;
  translatedPath1: string;
  translatedPath2: string;
  message: string;
}

function example(
  target: any,
  propertyKey: string | symbol,
  descriptor: PropertyDescriptor,
) {
  const original = descriptor.value;
  descriptor.value = function (...args: any) {
    try {
      ztoolkit.log(`Calling example ${target.name}.${String(propertyKey)}`);
      return original.apply(this, args);
    } catch (e) {
      ztoolkit.log(`Error in example ${target.name}.${String(propertyKey)}`, e);
      throw e;
    }
  };
  return descriptor;
}

export class BasicExampleFactory {
  @example
  static registerNotifier() {
    const callback = {
      notify: async (
        event: string,
        type: string,
        ids: number[] | string[],
        extraData: { [key: string]: any },
      ) => {
        if (!addon?.data.alive) {
          this.unregisterNotifier(notifierID);
          return;
        }
        addon.hooks.onNotify(event, type, ids, extraData);
      },
    };
    const notifierID = Zotero.Notifier.registerObserver(callback, [
      "tab",
      "item",
      "file",
    ]);

    Zotero.Plugins.addObserver({
      shutdown: ({ id }) => {
        if (id === addon.data.config.addonID)
          this.unregisterNotifier(notifierID);
      },
    });
  }

  @example
  static exampleNotifierCallback() {
    new ztoolkit.ProgressWindow(addon.data.config.addonName)
      .createLine({
        text: "Open Tab Detected!",
        type: "success",
        progress: 100,
      })
      .show();
  }

  @example
  private static unregisterNotifier(notifierID: string) {
    Zotero.Notifier.unregisterObserver(notifierID);
  }

  @example
  static registerPrefs() {
    Zotero.PreferencePanes.register({
      pluginID: addon.data.config.addonID,
      src: rootURI + "content/preferences.xhtml",
      label: getString("prefs-title"),
      image: `chrome://${addon.data.config.addonRef}/content/icons/favicon.png`,
    });
  }
}

export class KeyExampleFactory {}

export class UIExampleFactory {
  @example
  static registerRightClickMenuItem() {
    const menuIcon = `chrome://${addon.data.config.addonRef}/content/icons/favicon@0.5x.png`;
    // 添加自定义菜单项
    ztoolkit.Menu.register("item", {
      tag: "menuitem",
      id: "zotero-itemmenu-translate-pdf",
      label: "PDF2zh: Translate PDF",
      commandListener: (ev) => addon.hooks.onDialogEvents("translatePDF"),
      icon: menuIcon,
    });
  }
}
export class HelperExampleFactory {
  @example
  static async translatePDF() {
    try {
      const pane = ztoolkit.getGlobal("ZoteroPane");
      const selectedItems = pane.getSelectedItems();
      if (selectedItems.length === 0) {
        ztoolkit.getGlobal("alert")("请先选择一个条目或附件。");
        return;
      }
      for (const item of selectedItems) {
        let attachItem;
        if (item.isAttachment()) {
          attachItem = item;
        } else if (item.isRegularItem()) {
          const bestItem = await item.getBestAttachment();
          if (bestItem) {
            attachItem = bestItem;
          } else {
            continue;
          }
        } else {
          continue;
        }
        const filePath = attachItem.getFilePath();
        ztoolkit.log("selected attachment item filePath:", filePath);
        if (!filePath || !filePath.endsWith(".pdf")) {
          ztoolkit.getGlobal("alert")("请选择一个 PDF 附件。");
          return;
        }
        const ok = await HelperExampleFactory.runPythonScript(filePath, item);
        if (!ok) {
          ztoolkit.getGlobal("alert")("翻译失败，未生成 pdf。");
          return;
        }
      }
    } catch (error) {
      ztoolkit.log("Error in translatePDF:", error);
      ztoolkit.getGlobal("alert")("翻译过程中发生错误。请检查日志。");
    }
  }

  static async runPythonScript(
    inputPath: string,
    item: Zotero.Item,
  ): Promise<boolean | null> {
    const serverUrl = getPref("serverip")?.toString();
    ztoolkit.log("server url:", serverUrl);
    if (!serverUrl) {
      ztoolkit.getGlobal("alert")("请在首选项中配置 Python 服务器地址。");
      return null;
    }
    try {
      const response = await fetch(serverUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filePath: inputPath,
        }),
      });
      if (!response.ok) {
        throw new Error(`服务器响应状态码: ${response.status}`);
      }
      const jsonString = await response.text();
      const result: TranslationResponse = JSON.parse(jsonString);
      if (result.status === "success") {
        await HelperExampleFactory.addAttachmentToItem(
          item,
          result.translatedPath1,
          result.translatedPath2,
        );
        return true;
      } else {
        ztoolkit.getGlobal("alert")(result.message || "翻译失败，未生成 pdf。");
        return null;
      }
    } catch (error) {
      ztoolkit.log("Error communicating with Python server:", error);
      ztoolkit.getGlobal("alert")(
        "无法连接到翻译服务器。请确保 Python 服务器正在运行。",
      );
      return null;
    }
  }

  static async addAttachmentToItem(
    item: Zotero.Item,
    translatedPath1: string,
    translatedPath2: string,
  ): Promise<void> {
    try {
      const itemID = item.id;
      const libraryID = item.libraryID;
      if (item.isAttachment()) {
        if (item.parentItemID === null) {
          const newAttachment1 = await Zotero.Attachments.importFromFile({
            file: translatedPath1,
            libraryID: libraryID,
          });
          const newAttachment2 = await Zotero.Attachments.importFromFile({
            file: translatedPath2,
            libraryID: libraryID,
          });
        } else {
          const parentItemID = item.parentItemID;
          const newAttachment1 = await Zotero.Attachments.importFromFile({
            file: translatedPath1,
            parentItemID: parentItemID !== false ? parentItemID : undefined,
            libraryID: libraryID,
          });
          const newAttachment2 = await Zotero.Attachments.importFromFile({
            file: translatedPath2,
            parentItemID: parentItemID !== false ? parentItemID : undefined,
            libraryID: libraryID,
          });
        }
        ztoolkit.log(`已将翻译后的 PDF 附件添加到库 ${libraryID} 中。`);
      } else {
        const newAttachment1 = await Zotero.Attachments.importFromFile({
          file: translatedPath1,
          parentItemID: itemID,
        });
        const newAttachment2 = await Zotero.Attachments.importFromFile({
          file: translatedPath2,
          parentItemID: itemID,
        });
        ztoolkit.log(`已将翻译后的 PDF 附件添加到项目 ${itemID} 中。`);
      }
    } catch (error) {
      ztoolkit.log("Error adding attachment:", error);
      throw error;
    }
  }
}
