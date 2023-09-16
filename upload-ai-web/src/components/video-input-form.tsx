import { FileVideo, Upload } from "lucide-react";
import { Separator } from "./ui/separator";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Button } from "./ui/button";
import { ChangeEvent, FormEvent, useMemo, useRef, useState } from "react";
import { getFFmpeg } from "@/lib/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import { api } from "@/lib/axios";

type Status = 'waiting' | 'converting' | 'uploading' | 'generating' | 'success';

const statusMessages = {
  converting: 'Convertendo...',
  generating: 'Transcrevendo...',
  uploading: 'Carregando...',
  success: 'Sucesso!',
}

interface VideoInputFormProps {
  onVideoUploaded: (id: string) => void
}

export function VideoInputForm(props: VideoInputFormProps) {
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [status, setStatus] = useState<Status>('waiting')

  const promptInputRef = useRef<HTMLTextAreaElement>(null)

  function handleFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const { files } = event.currentTarget

    if(!files) {
      return
    }

    const selectedFile = files[0]

    setVideoFile(selectedFile)
  }

  async function convertVideoToAudio(video: File) {
    console.log('Convert Starting')

    const ffmpeg = await getFFmpeg()

    //Escrever um arquivop .mp4
    await ffmpeg.writeFile('input.mp4', await fetchFile(video))

    //Caso de Erro
    //ffmpeg.on('log', log => {
      //console.log(log)
    //})

    ffmpeg.on('progress', progress => {
      console.log('Convert progress: ' + Math.round(progress.progress * 100))
    })

    await ffmpeg.exec([ //Execucao da Funcao exec do ffmpeg
      '-i', // Indicador usado no FFmpeg para especificar a entrada de um arquivo
      'input.mp4', // Expecificação que a entrada pelo -i é um arquivo .mp4 (video)
      '-map', // Indicador usado para especificar quais fluxos de entrada devem ser mapeados para o arquivo de saída
      '0:a', // Mapeando o fluxo de áudio do arquivo de entrada (índice 0) para o arquivo de saída.
      '-b:a', //  Indicador usado para especificar a taxa de bits de áudio. 
      '20k', //Taxa de bits de áudio no arquivo de saída será de 20 quilobits por segundo.
      '-acodec', //Usado para especificar o codec de áudio que será usado na conversão.
      'libmp3lame', //Codec de áudio usado para comprimir o áudio no formato .mp3
      'output.mp3' //Nome do arquivo de saída onde o áudio convertido será salvo.
    ])

    //Le um arquivop .mp3
    const data = await ffmpeg.readFile('output.mp3');

    const audioFileBlod = new Blob([data], { type: 'audio/mpeg' });
    const audioFile = new File([audioFileBlod], 'audio.mp3', {
      type: 'audio/mpeg'
    });

    console.log('Convert finished.')

    return audioFile
  }

  async function handleUploadVideo(event: FormEvent<HTMLFormElement>){
    event.preventDefault()

    const prompt = promptInputRef.current?.value

    if (!videoFile) {
      return
    }

    setStatus('converting')

    //Converter o video em audio
    const audioFile = await convertVideoToAudio(videoFile)

    //Envio do audio para o backend
    const data = new FormData()

    data.append('file', audioFile)

    setStatus('uploading')

    const response = await api.post('/videos', data)

    const videoId = response.data.video.id

    setStatus('generating')

    await api.post(`/videos/${videoId}/transcription`, {
      prompt,
    })

    setStatus('success')

    props.onVideoUploaded(videoId)
  }

  const previewUrl = useMemo(() => {
    if(!videoFile) {
      return null
    }

    return URL.createObjectURL(videoFile)
  }, [videoFile])

  return(
    <form onSubmit={handleUploadVideo} className='space-y-6'>
      <label
        htmlFor='video'
        className=' relative border flex rounded-md aspect-video cursor-pointer border-dashed text-sm flex-col gap-2 items-center justify-center text-muted-foreground hover:bg-primary/5'
        >
          {previewUrl ? (
            <video src={previewUrl} controls={false} className="pointer-events-none absolute inset-0"/>
          ) : (
            <>
              <FileVideo className='w-4 h-4'/>
              Selecione um video
            </>
          )}
      </label>

      <input type="file" id='video' accept='video/mp4' className='sr-only' onChange={handleFileSelected}/>

      <Separator />

      <div className='space-y-2'>
        <Label htmlFor='transcription_prompt'>Prompt de transcrição</Label>
        <Textarea
          ref={promptInputRef}
          disabled={status !== 'waiting'}
          id='transcription_prompt'
          className='h-20 leading-relaxed resize-none'
          placeholder='Inclua palavras-chave mencionadas no vídeo por vírgulas (,)'
        />
      </div>

      <Button
        data-success={status === 'success'}
        disabled={status !== 'waiting'}
        type="submit"
        className="w-full data-[success=true]:bg-emerald-400"
      >
        {status === 'waiting'? (
          <>
            Carregar video
            <Upload className="w-4 h-4 ml-2" />
          </>
        ) : statusMessages[status]}
      </Button>
    </form>
  )
}