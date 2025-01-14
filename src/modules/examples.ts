import { getLocaleID, getString } from "../utils/locale";
interface TranslationResponse {
    status: string;
    translatedPath: string;
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
            ztoolkit.log(
                `Calling example ${target.name}.${String(propertyKey)}`,
            );
            return original.apply(this, args);
        } catch (e) {
            ztoolkit.log(
                `Error in example ${target.name}.${String(propertyKey)}`,
                e,
            );
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

        // Register the callback in Zotero as an item observer
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

export class KeyExampleFactory {
}

export class UIExampleFactory {
    @example
    static registerRightClickMenuItem() {
        const menuIcon = `chrome://${addon.data.config.addonRef}/content/icons/favicon@0.5x.png`;
        // 添加自定义菜单项
        ztoolkit.Menu.register("item", {
            tag: "menuitem",
            id: "zotero-itemmenu-translate-pdf",
            label: "Translate PDF",
            commandListener: (ev) => addon.hooks.onDialogEvents("translatePDF"),
            icon: menuIcon,
        });
    }
}

export class PromptExampleFactory {
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
                if (!item.isRegularItem()) {
                    continue;
                }
                const attachmentItems = [];
                for (const item of selectedItems) {
                  if (item.isAttachment()) {
                    attachmentItems.push(item);
                  } else if (item.isRegularItem()) {
                    item.getAttachments()
                      .map((id) => Zotero.Items.get(id))
                      .filter((item) => item.isAttachment())
                      .forEach((item) => attachmentItems.push(item));
                  }
                }
                const attachItem = attachmentItems[0];
                const filePath = attachItem.getFilePath();
                ztoolkit.log("selected attachment item filePath:", filePath);
                if (!filePath || !filePath.endsWith(".pdf")) {
                    ztoolkit.getGlobal("alert")("请选择一个 PDF 附件。");
                    return;
                }
                const translatedPath =
                    await HelperExampleFactory.runPythonScript(filePath);
                if (translatedPath) {
                    await HelperExampleFactory.addAttachmentToItem(
                        item,
                        translatedPath,
                    );
                    ztoolkit.getGlobal("alert")("翻译完成.pdf 已添加到条目中。");
                } else {
                    ztoolkit.getGlobal("alert")("翻译失败，未生成 pdf。");
                }
            }
        } catch (error) {
            ztoolkit.log("Error in translatePDF:", error);
            ztoolkit.getGlobal("alert")("翻译过程中发生错误。请检查日志。");
        }
    }
    
    static async runPythonScript(inputPath: string): Promise<string | null> {
        const serverUrl = "http://localhost:8888/translate"; // Python 服务器的地址
        const outputDir = "/Users/zhangxinyue/personal/code/pdftranslate/translated/example-mono.pdf";
        try {
            const response = await fetch(serverUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    filePath: inputPath,
                    outputDir: outputDir,
                    threads: 4, 
                }),
            });
    
            if (!response.ok) {
                throw new Error(`服务器响应状态码: ${response.status}`);
            }
            const jsonString = await response.text();
            const result: TranslationResponse = JSON.parse(jsonString);
            
            ztoolkit.log("翻译成功 haha:", result);
            ztoolkit.log("翻译后的文件路径:", result.translatedPath);

            if (result.status === "success") {
                return result.translatedPath;
            } else {
                ztoolkit.getGlobal("alert")(result.message || "翻译失败，未生成 pdf。");
                return null;
            }
        } catch (error) {
            ztoolkit.log("Error communicating with Python server:", error);
            ztoolkit.getGlobal("alert")("无法连接到翻译服务器。请确保 Python 服务器正在运行。");
            return null;
        }
    }

    static async addAttachmentToItem(
        item: Zotero.Item,
        translatedPath: string,
    ): Promise<void> {
        try {
            const itemID = item.id;
            const newAttachment = await Zotero.Attachments.importFromFile({
                file: translatedPath,
                parentItemID: itemID,
            });
            ztoolkit.log(`已将翻译后的 PDF 附件添加到项目 ${itemID} 中。`);
        } catch (error) {
            ztoolkit.log("Error adding attachment:", error);
            throw error;
        }
    }
    // ************************************************************************************************
}
