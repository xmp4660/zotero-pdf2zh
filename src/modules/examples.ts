import { getLocaleID, getString } from "../utils/locale";
import { getPref } from "../utils/prefs";
import axios from "axios";
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

export class UIExampleFactory {
    @example
    static registerRightClickMenuItem() {
        const menuIcon = `chrome://${addon.data.config.addonRef}/content/icons/favicon@0.5x.svg`;
        ztoolkit.Menu.register("item", {
            tag: "menuitem",
            id: "zotero-itemmenu-translate-pdf",
            label: "PDF2zh: Translate PDF",
            commandListener: (ev) => addon.hooks.onDialogEvents("translatePDF"),
            icon: menuIcon,
        });
    }
}

function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

export class HelperExampleFactory {
    @example
    static async translatePDF() {
        let serverUrl = getPref("serverip")?.toString();
        ztoolkit.log("server url:", serverUrl);
        if (!serverUrl) {
            ztoolkit.getGlobal("alert")("请在首选项中配置 Python 服务器地址。");
            return null;
        }
        if (serverUrl.endsWith("/")) {
            serverUrl = serverUrl.slice(0, -1);
        }
        if (serverUrl.endsWith("/translate")) {
            serverUrl = serverUrl.slice(0, -10);
        }
        ztoolkit.log("server url:", serverUrl);

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
                    attachItem = bestItem;
                }
                if (!attachItem) {
                    continue;
                }

                const filepath = attachItem.getFilePath();
                if (!filepath || !filepath.endsWith(".pdf")) {
                    ztoolkit.getGlobal("alert")("请选择一个 PDF 附件。");
                    return;
                }

                if (!filepath || (await IOUtils.exists(filepath))) {
                    const contentRaw = await IOUtils.read(filepath);
                    const blob = new Blob([contentRaw], {
                        type: "application/pdf",
                    });
                    const base64Blob = await blobToBase64(blob);
                    const data = {
                        filePath: filepath,
                        fileContent: base64Blob,
                    };
                    const response = await fetch(serverUrl + "/translate", {
                        // 发送翻译请求
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify(data),
                    });

                    if (!response.ok) {
                        throw new Error(`服务器响应失败: ${response.ok}`);
                    }

                    const jsonString = await response.text();
                    const result: TranslationResponse = JSON.parse(jsonString);

                    // 如果用的是旧脚本, 直接在本地读取文件也是可以的
                    if (
                        result.translatedPath1 != null &&
                        result.translatedPath2 != null &&
                        (await IOUtils.exists(result.translatedPath1)) &&
                        (await IOUtils.exists(result.translatedPath2))
                    ) {
                        await HelperExampleFactory.addAttachmentToItem(
                            item,
                            result.translatedPath1,
                        );
                        await HelperExampleFactory.addAttachmentToItem(
                            item,
                            result.translatedPath2,
                        );
                        continue;
                    }

                    // 以下是新脚本的处理方式
                    const fileName = PathUtils.filename(filepath);
                    const fileName1 = fileName.replace(".pdf", "-mono.pdf");
                    const fileName2 = fileName.replace(".pdf", "-dual.pdf");
                    if (result.status === "success") {
                        const response1 = await axios.get(
                            serverUrl + "/translatedFile/" + fileName1,
                            {
                                responseType: "arraybuffer",
                            },
                        );
                        const uint8Array1 = new Uint8Array(response1.data);
                        const tempDir1 = PathUtils.join(
                            PathUtils.tempDir,
                            fileName1,
                        );
                        IOUtils.write(tempDir1, uint8Array1);
                        await HelperExampleFactory.addAttachmentToItem(
                            item,
                            tempDir1,
                        );
                        IOUtils.remove(tempDir1);

                        const response2 = await axios.get(
                            serverUrl + "/translatedFile/" + fileName2,
                            {
                                responseType: "arraybuffer",
                            },
                        );
                        const uint8Array = new Uint8Array(response2.data);
                        const tempDir2 = PathUtils.join(
                            PathUtils.tempDir,
                            fileName2,
                        );
                        IOUtils.write(tempDir2, uint8Array);
                        await HelperExampleFactory.addAttachmentToItem(
                            item,
                            tempDir2,
                        );
                        IOUtils.remove(tempDir2);
                    }
                }
            }
        } catch (error) {
            ztoolkit.getGlobal("alert")(
                "zotero-pdf2zh(remote) 发生错误: \n" + error,
            );
            return null;
        }
    }

    @example
    static async translateOriginalPDF() {
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
                    attachItem = bestItem;
                }
                if (!attachItem) {
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
            ztoolkit.getGlobal("alert")(
                "zotero-pdf2zh 插件发生错误: \n" + error,
            );
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
