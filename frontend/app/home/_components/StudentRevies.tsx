import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export default function StudentReviews() {
    return <div className="flex mr-auto ml-auto justify-center mt-20">
        <div className="flex items-center"> 
            <Avatar className="z-20 w-15 h-10 border-4 border-white">
                <AvatarImage
                    src="https://github.com/shadcn.png"
                    alt="@shadcn"
                    className="grayscale"
                />
                <AvatarFallback>CN</AvatarFallback>
            </Avatar>
            <Avatar className="translate-x-[-50%] w-10 h-10 z-10 border-4 border-white">
                <AvatarImage
                    src="https://github.com/shadcn.png"
                    alt="@shadcn"
                    className="grayscale"
                />
                <AvatarFallback>CN</AvatarFallback>
            </Avatar>
            <Avatar className="-translate-x-full w-10 h-10 z-0 border-4 border-white">
                <AvatarImage
                    src="https://github.com/shadcn.png"
                    alt="@shadcn"
                    className="grayscale"
                />
                <AvatarFallback>CN</AvatarFallback>
            </Avatar>

            <div className="text-black z-40 -ml-8">
                <span className="text-yellow-700"> 
                    125K+
                </span> Students</div>
        </div>
    </div>
}