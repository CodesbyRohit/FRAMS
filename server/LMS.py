import sqlite3
import tkinter as tk
from tkinter import messagebox, ttk

# --- DATABASE LOGIC ---
def init_db():
    conn = sqlite3.connect('library.db')
    cursor = conn.cursor()
    # Create Books Table
    cursor.execute('''CREATE TABLE IF NOT EXISTS books (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        title TEXT NOT NULL,
                        author TEXT,
                        status TEXT DEFAULT 'Available')''')
    # Create Transactions Table
    cursor.execute('''CREATE TABLE IF NOT EXISTS transactions (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        book_id INTEGER,
                        user_name TEXT,
                        action TEXT,
                        date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY(book_id) REFERENCES books(id))''')
    conn.commit()
    conn.close()

class LibrarySystem:
    def __init__(self, root):
        self.root = root
        self.root.title("Library Management System")
        self.root.geometry("600x400")

        # UI Elements
        tk.Label(root, text="Library Management System", font=("Arial", 18, "bold")).pack(pady=10)

        btn_frame = tk.Frame(root)
        btn_frame.pack(pady=20)

        tk.Button(btn_frame, text="Add Book", width=15, command=self.add_book_window).grid(row=0, column=0, padx=5, pady=5)
        tk.Button(btn_frame, text="View Books", width=15, command=self.view_books).grid(row=0, column=1, padx=5, pady=5)
        tk.Button(btn_frame, text="Issue Book", width=15, command=self.issue_book_window).grid(row=1, column=0, padx=5, pady=5)
        tk.Button(btn_frame, text="Return Book", width=15, command=self.return_book_window).grid(row=1, column=1, padx=5, pady=5)

    def add_book_window(self):
        win = tk.Toplevel(self.root)
        win.title("Add New Book")
        
        tk.Label(win, text="Title:").grid(row=0, column=0, padx=10, pady=5)
        title_entry = tk.Entry(win)
        title_entry.grid(row=0, column=1, padx=10, pady=5)

        tk.Label(win, text="Author:").grid(row=1, column=0, padx=10, pady=5)
        author_entry = tk.Entry(win)
        author_entry.grid(row=1, column=1, padx=10, pady=5)

        def save():
            t, a = title_entry.get(), author_entry.get()
            if t:
                conn = sqlite3.connect('library.db')
                cursor = conn.cursor()
                cursor.execute("INSERT INTO books (title, author) VALUES (?, ?)", (t, a))
                conn.commit()
                conn.close()
                messagebox.showinfo("Success", "Book added successfully!")
                win.destroy()
            else:
                messagebox.showwarning("Error", "Title is required")

        tk.Button(win, text="Save", command=save).grid(row=2, columnspan=2, pady=10)

    def view_books(self):
        win = tk.Toplevel(self.root)
        win.title("Book Records")
        
        tree = ttk.Treeview(win, columns=("ID", "Title", "Author", "Status"), show='headings')
        tree.heading("ID", text="ID")
        tree.heading("Title", text="Title")
        tree.heading("Author", text="Author")
        tree.heading("Status", text="Status")
        tree.pack(fill=tk.BOTH, expand=True)

        conn = sqlite3.connect('library.db')
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM books")
        for row in cursor.fetchall():
            tree.insert("", tk.END, values=row)
        conn.close()

    def issue_book_window(self):
        # Logic for issuing a book (updates status to 'Issued')
        pass

    def return_book_window(self):
        # Logic for returning a book (updates status to 'Available')
        pass

if __name__ == "__main__":
    init_db()
    # Note: root.mainloop() is called in standard desktop environments
    print("Database initialized. Prototype classes defined.")
    print("To run as a desktop app, execute this script locally.")