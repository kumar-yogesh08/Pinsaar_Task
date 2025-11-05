import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import dayjs from "dayjs";
import { motion } from "framer-motion";
import { api } from "./api.js";
import NoteRow from "./NoteRow";

export default function App() {
  const { register, handleSubmit, reset } = useForm({
    defaultValues: {
      title: "",
      body: "",
      releaseAt: dayjs().toISOString(),
      webhookUrl: "http://sink:4000/sink",
    },
  });
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [notes, setNotes] = useState([]);
  const [meta, setMeta] = useState({ totalPages: 1 });

  async function load() {
    const query = new URLSearchParams();
    if (status) query.set("status", status);
    query.set("page", String(page));
    const data = await api(`/notes?${query.toString()}`);
    setNotes(data.items);
    setMeta({ totalPages: data.totalPages });
  }

  useEffect(() => {
    load();
  }, [status, page]);

  const onSubmit = async (v) => {
    await api("/notes", { method: "POST", body: v });
    reset({
      title: "",
      body: "",
      releaseAt: dayjs().toISOString(),
      webhookUrl: v.webhookUrl,
    });
    await load();
  };

  const replay = async (id) => {
    await api(`/notes/${id}/replay`, { method: "POST" });
    await load();
  };

  return (
    <div
      style={{
        padding: 20,
        fontFamily: "system-ui, sans-serif",
        maxWidth: 900,
        margin: "0 auto",
      }}
    >
      <h1>DropLater Admin</h1>

      <section style={{ marginBottom: 24 }}>
        <h2>Create Note</h2>
        <form
          onSubmit={handleSubmit(onSubmit)}
          style={{ display: "grid", gap: 8 }}
        >
          <input
            placeholder="Title"
            {...register("title", { required: true })}
          />
          <textarea
            placeholder="Body"
            rows={4}
            {...register("body", { required: true })}
          />
          <input
            placeholder="ReleaseAt ISO"
            {...register("releaseAt", { required: true })}
          />
          <input
            placeholder="Webhook URL"
            {...register("webhookUrl", { required: true })}
          />
          <button type="submit">Create</button>
        </form>
      </section>

      <section>
        <h2>Notes</h2>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <select
            value={status}
            onChange={(e) => {
              setPage(1);
              setStatus(e.target.value);
            }}
          >
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
            <option value="dead">Dead</option>
            <option value="delivered">Delivered</option>
          </select>
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Prev
          </button>
          <span>
            Page {page}/{meta.totalPages}
          </span>
          <button
            disabled={page >= meta.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          {notes.map((n) => (
            <motion.div
              key={n.id}
              animate={
                n.status === "delivered"
                  ? { backgroundColor: ["#fff", "#e6ffed", "#fff"] }
                  : {}
              }
              transition={{ duration: 0.8 }}
            >
              <NoteRow note={n} onReplay={replay} />
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  );
}
