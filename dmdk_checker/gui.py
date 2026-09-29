#!/usr/bin/env python3
"""Простое окно для проверки УИН в ГИИС ДМДК без командной строки."""
from __future__ import annotations

import queue
import threading
import tkinter as tk
from datetime import datetime
from pathlib import Path
from tkinter import filedialog, messagebox, ttk
from tkinter.scrolledtext import ScrolledText

import dmdk_checker as dc


class App(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title("Проверка УИН в ГИИС ДМДК")
        self.geometry("760x560")
        self.minsize(640, 460)
        self.msgs: queue.Queue = queue.Queue()
        self.stop_flag = threading.Event()
        self.worker: threading.Thread | None = None

        pad = {"padx": 8, "pady": 4}
        frm = ttk.Frame(self)
        frm.pack(fill="x", **pad)

        ttk.Label(frm, text="Файл со списком УИН (.xlsx, .csv, .txt):").grid(row=0, column=0, sticky="w")
        self.in_var = tk.StringVar()
        ttk.Entry(frm, textvariable=self.in_var).grid(row=1, column=0, sticky="ew")
        ttk.Button(frm, text="Выбрать…", command=self.pick_input).grid(row=1, column=1, padx=4)

        ttk.Label(frm, text="…или вставьте УИН сюда, по одному в строке:").grid(row=2, column=0, sticky="w", pady=(8, 0))
        self.paste = ScrolledText(frm, height=6)
        self.paste.grid(row=3, column=0, columnspan=2, sticky="ew")

        ttk.Label(frm, text="Куда сохранить результат (.xlsx):").grid(row=4, column=0, sticky="w", pady=(8, 0))
        self.out_var = tk.StringVar(value=str(Path.cwd() / f"results_{datetime.now():%Y-%m-%d}.xlsx"))
        ttk.Entry(frm, textvariable=self.out_var).grid(row=5, column=0, sticky="ew")
        ttk.Button(frm, text="Выбрать…", command=self.pick_output).grid(row=5, column=1, padx=4)

        opts = ttk.Frame(frm)
        opts.grid(row=6, column=0, columnspan=2, sticky="w", pady=(8, 0))
        self.show_var = tk.BooleanVar(value=False)
        ttk.Checkbutton(opts, text="Показывать браузер (если сайт просит капчу)",
                        variable=self.show_var).pack(side="left")
        ttk.Label(opts, text="   Пауза, сек:").pack(side="left")
        self.delay_var = tk.DoubleVar(value=2.0)
        ttk.Spinbox(opts, from_=0.5, to=30, increment=0.5, width=5,
                    textvariable=self.delay_var).pack(side="left")
        frm.columnconfigure(0, weight=1)

        btns = ttk.Frame(self)
        btns.pack(fill="x", **pad)
        self.start_btn = ttk.Button(btns, text="Начать проверку", command=self.start)
        self.start_btn.pack(side="left")
        self.stop_btn = ttk.Button(btns, text="Остановить", command=self.stop, state="disabled")
        self.stop_btn.pack(side="left", padx=6)
        self.progress = ttk.Progressbar(btns, mode="determinate")
        self.progress.pack(side="left", fill="x", expand=True, padx=6)

        self.log_box = ScrolledText(self, height=12, state="disabled")
        self.log_box.pack(fill="both", expand=True, **pad)
        self.after(150, self.poll)

    def pick_input(self) -> None:
        path = filedialog.askopenfilename(
            filetypes=[("Списки УИН", "*.xlsx *.csv *.txt"), ("Все файлы", "*.*")])
        if path:
            self.in_var.set(path)
            self.out_var.set(str(Path(path).with_name(f"{Path(path).stem}_результат.xlsx")))

    def pick_output(self) -> None:
        path = filedialog.asksaveasfilename(defaultextension=".xlsx",
                                            filetypes=[("Excel", "*.xlsx")])
        if path:
            self.out_var.set(path)

    def log(self, text: str) -> None:
        self.msgs.put(("log", text))

    def poll(self) -> None:
        while not self.msgs.empty():
            kind, value = self.msgs.get()
            if kind == "log":
                self.log_box.configure(state="normal")
                self.log_box.insert("end", value + "\n")
                self.log_box.see("end")
                self.log_box.configure(state="disabled")
            elif kind == "progress":
                done, total = value
                self.progress.configure(maximum=total, value=done)
            elif kind == "done":
                self.start_btn.configure(state="normal")
                self.stop_btn.configure(state="disabled")
                if value:
                    messagebox.showinfo("Готово", f"Результат сохранён:\n{value}")
        self.after(150, self.poll)

    def collect_uins(self) -> list[str]:
        uins: list[str] = []
        if self.in_var.get().strip():
            uins += dc.read_uins(Path(self.in_var.get().strip()))
        for line in self.paste.get("1.0", "end").splitlines():
            uin = dc.normalize_uin(line)
            if dc.looks_like_uin(uin) and uin not in uins:
                uins.append(uin)
        return uins

    def start(self) -> None:
        try:
            uins = self.collect_uins()
        except Exception as e:  # noqa: BLE001
            messagebox.showerror("Ошибка", f"Не удалось прочитать файл:\n{e}")
            return
        if not uins:
            messagebox.showwarning("Нет УИН", "Выберите файл или вставьте список УИН.")
            return
        out = Path(self.out_var.get().strip() or "results.xlsx")
        if out.suffix.lower() != ".xlsx":
            out = out.with_suffix(".xlsx")
        self.stop_flag.clear()
        self.start_btn.configure(state="disabled")
        self.stop_btn.configure(state="normal")
        self.progress.configure(maximum=len(uins), value=0)
        self.log(f"УИН к проверке: {len(uins)}")

        def work() -> None:
            result = ""
            try:
                dc.run(uins, out, headless=not self.show_var.get(),
                       delay=float(self.delay_var.get()), log=self.log,
                       progress=lambda d, t: self.msgs.put(("progress", (d, t))),
                       should_stop=self.stop_flag.is_set)
                result = str(out)
            except Exception as e:  # noqa: BLE001
                self.log(f"ОШИБКА: {e}")
            self.msgs.put(("done", result))

        self.worker = threading.Thread(target=work, daemon=True)
        self.worker.start()

    def stop(self) -> None:
        self.stop_flag.set()
        self.log("Останавливаю после текущего УИН…")


if __name__ == "__main__":
    App().mainloop()
