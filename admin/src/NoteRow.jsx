export default function NoteRow({ note, onReplay }) {
  return (
    <div style={{ border:'1px solid #ddd', padding:12, borderRadius:8, display:'grid', gridTemplateColumns:'1fr auto', alignItems:'center' }}>
      <div>
        <div style={{ fontWeight:600 }}>{note.title}</div>
        <div style={{ fontSize:12, opacity:0.75 }}>
          status: {note.status} • releaseAt: {new Date(note.releaseAt).toISOString()} • lastCode: {note.lastAttemptCode ?? '-'}
        </div>
      </div>
      <div>
        {(note.status === 'dead' || note.status === 'failed') && (
          <button onClick={() => onReplay(note.id)}>Replay</button>
        )}
      </div>
    </div>
  );
}
