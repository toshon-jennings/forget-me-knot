import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("toolbox", {
  getData: () => ipcRenderer.invoke("get-data"),
  addService: (data: { url: string; name?: string; category?: string; notes?: string }) =>
    ipcRenderer.invoke("add-service", data),
  openService: (id: string) => ipcRenderer.invoke("open-service", id),
  removeService: (id: string) => ipcRenderer.invoke("remove-service", id),
  editService: (id: string, data: { url: string; name?: string; category?: string; notes?: string }) =>
    ipcRenderer.invoke("edit-service", id, data),
});
