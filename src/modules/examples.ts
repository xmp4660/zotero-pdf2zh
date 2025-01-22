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
      image: `chrome://${addon.data.config.addonRef}/content/icons/favicon.svg`,
    });
  }
}

export class KeyExampleFactory {}

export class UIExampleFactory {
  @example
  static registerRightClickMenuItem() {
    const menuIcon = `chrome://${addon.data.config.addonRef}/content/icons/favicon@0.5x.svg`;
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
        await HelperExampleFactory.runPythonScript(filePath, item);
      }
    } catch (error) {
      ztoolkit.getGlobal("alert")("zotero-pdf2zh 插件发生错误: \n" + error);
      return null;
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
      throw new Error(`服务器响应失败: ${response.ok}`);
    }
    const jsonString = await response.text();
    const result: TranslationResponse = JSON.parse(jsonString);
    if (result.status === "success") {
      await Promise.all([
        await HelperExampleFactory.addAttachmentToItem(
          item,
          result.translatedPath1,
        ),
        await HelperExampleFactory.addAttachmentToItem(
          item,
          result.translatedPath2,
        ),
      ]);
      return true;
    } else {
      throw new Error(`服务器响应失败, 响应状态: ${response.status}`);
    }
  }

  static async addAttachmentToItem(
    item: Zotero.Item,
    translatedPath: string,
  ): Promise<void> {
    const itemID = item.id;
    const libraryID = item.libraryID;
    const collectionID = item.getCollections()[0];

    if (item.isAttachment()) {
      const parentItemID = item.parentItemID;
      await Promise.all([
        Zotero.Attachments.importFromFile({
          file: translatedPath,
          parentItemID:
            parentItemID != null && parentItemID !== false
              ? parentItemID
              : undefined,
          libraryID: libraryID,
          collections:
            (parentItemID == null || parentItemID == false) &&
            collectionID != null
              ? [collectionID]
              : undefined,
        }),
      ]);
      ztoolkit.log(`已将翻译后的 PDF 附件添加到库 ${libraryID} 中。`);
    } else {
      await Promise.all([
        Zotero.Attachments.importFromFile({
          file: translatedPath,
          parentItemID: itemID,
        }),
      ]);
      ztoolkit.log(`已将翻译后的 PDF 附件添加到项目 ${itemID} 中。`);
    }
  }
}
